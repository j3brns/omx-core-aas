/**
 * PlatformStack — REST API, WAF, CloudFront, Bridge Lambda, BFF Lambda,
 *                 Authoriser Lambda, AgentCore Gateway.
 *
 * REST API (not HTTP API) with usage plans, per-method throttling, WAF association.
 * Public SPA CloudFront distribution currently has an explicit no-WebACL exception:
 * the platform has not yet introduced an approved global/us-east-1 edge security stack,
 * so only the regional API surface is WAF-protected in this stack.
 * Authoriser Lambda: provisioned concurrency 10.
 * AgentCore Gateway with REQUEST and RESPONSE interceptors wired.
 *
 * Implemented in TASK-023.
 * ADRs: ADR-003, ADR-004, ADR-009, ADR-011
 */
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

import { createPlatformCompute } from './platform-compute';
import { resolveEntraConfiguration } from './entra-config';
import { createPlatformStorage } from './platform-storage';
import { TenantStack } from './tenant-stack';
import { PlatformSpa } from './platform-spa';
import { PlatformApi } from './platform-api';
import { PlatformWaf } from './platform-waf';
import { PlatformGateway } from './platform-gateway';

const TENANT_AUTHORIZED_RUNTIME_REGIONS = ['eu-west-1', 'eu-central-1'] as const;

type PythonLambdaProps = {
  assetPath: string;
  handler: string;
  functionNameSuffix: string;
  timeout: cdk.Duration;
  memorySize: number;
  environment?: Record<string, string>;
};

type BridgeCanaryPolicy = {
  readonly deploymentConfig: codedeploy.ILambdaDeploymentConfig;
  readonly summary: string;
};

type GatewayPolicyConfiguration = {
  readonly enforcementMode: 'LOG_ONLY' | 'ENFORCE';
  readonly policyEngineName: string;
  readonly policyName: string;
};

export interface PlatformStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  readonly lambdaSecurityGroup: ec2.ISecurityGroup;
}

function ensureTenantStubTemplate(
  env: string,
  stackEnv: cdk.Environment,
  authorizedRuntimeRegions: readonly string[],
): string {
  const generatedDir = path.join(__dirname, '../generated');
  const stackId = `platform-tenant-stub-${env}`;
  const templatePath = path.join(generatedDir, `${stackId}.template.json`);

  if (fs.existsSync(templatePath)) {
    return templatePath;
  }

  fs.mkdirSync(generatedDir, { recursive: true });

  const tempApp = new cdk.App({
    outdir: generatedDir,
    context: {
      env,
    },
  });

  const tenantStubStack = new TenantStack(tempApp, stackId, {
    env: stackEnv,
    description: `Platform per-tenant resources stub — ${env}`,
    authorizedRuntimeRegions,
  });

  const tenantTemplate = Template.fromStack(tenantStubStack).toJSON();
  fs.writeFileSync(templatePath, JSON.stringify(tenantTemplate, null, 2));

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Failed to synthesize tenant stub template at ${templatePath}`);
  }

  return templatePath;
}

export class PlatformStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly lambdaSecurityGroup: ec2.ISecurityGroup;
  public readonly api: apigateway.RestApi;
  public readonly tenantsTable: dynamodb.Table;
  public readonly agentsTable: dynamodb.Table;
  public readonly invocationsTable: dynamodb.Table;
  public readonly jobsTable: dynamodb.Table;
  public readonly sessionsTable: dynamodb.Table;
  public readonly toolsTable: dynamodb.Table;
  public readonly opsLocksTable: dynamodb.Table;
  public readonly gatewayIdempotencyTable: dynamodb.Table;

  public readonly bridgeFn: lambda.Function;
  public readonly bffFn: lambda.Function;
  public readonly authoriserFn: lambda.Function;
  public readonly tenantMgmtFn: lambda.Function;
  public readonly webhookRegistryFn: lambda.Function;
  public readonly agentRegistryFn: lambda.Function;
  public readonly adminOpsFn: lambda.Function;
  public readonly webhookDeliveryFn: lambda.Function;
  public readonly requestInterceptorFn: lambda.Function;
  public readonly responseInterceptorFn: lambda.Function;
  public readonly billingFn: lambda.Function;
  public readonly diagnosticsFn: lambda.Function;

  public readonly apiWebAcl: wafv2.CfnWebACL;
  public readonly spaDistribution: cloudfront.CfnDistribution;

  public readonly dlqs: Record<string, sqs.IQueue> = {};

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);
    this.vpc = props.vpc;
    this.lambdaSecurityGroup = props.lambdaSecurityGroup;

    const env = ((this.node.tryGetContext('env') as string | undefined) ?? 'dev').toLowerCase();
    const bridgeCanaryPolicy = this.resolveBridgeCanaryPolicy(env);
    const gatewayPolicyConfiguration = this.resolveGatewayPolicyConfiguration(env);
    const entra = resolveEntraConfiguration(this);

    const spaDomainName = this.node.tryGetContext('spaDomainName') as string | undefined;
    const spaCertificateArn = this.node.tryGetContext('spaCertificateArn') as string | undefined;
    const apiDomainName = this.node.tryGetContext('apiDomainName') as string | undefined;
    const apiCertificateArn = this.node.tryGetContext('apiCertificateArn') as string | undefined;

    const scopedTokenSigningKeySecret = new secretsmanager.Secret(this, 'ScopedTokenSigningKeySecret', {
      secretName: `platform/${env}/gateway/scoped-token-signing-key`, // pragma: allowlist secret
      description: 'Signing key for scoped act-on-behalf tokens issued by Gateway interceptor',
      generateSecretString: {
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    const storage = createPlatformStorage(this, { envName: env });
    this.tenantsTable = storage.tenantsTable;
    this.agentsTable = storage.agentsTable;
    this.toolsTable = storage.toolsTable;
    this.opsLocksTable = storage.opsLocksTable;
    this.gatewayIdempotencyTable = storage.gatewayIdempotencyTable;
    this.invocationsTable = storage.invocationsTable;
    this.jobsTable = storage.jobsTable;
    this.sessionsTable = storage.sessionsTable;

    const tenantStackTemplatePath = ensureTenantStubTemplate(
      env,
      this.env,
      TENANT_AUTHORIZED_RUNTIME_REGIONS,
    );
    const tenantStackTemplateAsset = new s3assets.Asset(this, 'TenantStackTemplateAsset', {
      path: tenantStackTemplatePath,
    });
    
    const compute = createPlatformCompute(this, {
      envName: env,
      storage,
      entra,
      scopedTokenSigningKeySecret,
      tenantStackTemplateAsset,
      createPythonLambda: (lambdaProps) => this.createPythonLambda(lambdaProps),
    });
    this.tenantMgmtFn = compute.tenantMgmtFn;
    this.webhookRegistryFn = compute.webhookRegistryFn;
    this.agentRegistryFn = compute.agentRegistryFn;
    this.adminOpsFn = compute.adminOpsFn;
    this.bridgeFn = compute.bridgeFn;
    this.webhookDeliveryFn = compute.webhookDeliveryFn;
    this.bffFn = compute.bffFn;
    this.authoriserFn = compute.authoriserFn;
    this.requestInterceptorFn = compute.requestInterceptorFn;
    this.responseInterceptorFn = compute.responseInterceptorFn;
    this.billingFn = compute.billingFn;
    this.diagnosticsFn = compute.diagnosticsFn;
    Object.assign(this.dlqs, compute.dlqs);

    const bridgeAlias = new lambda.Alias(this, 'BridgeLiveAlias', {
      aliasName: 'live',
      version: this.bridgeFn.currentVersion,
    });

    const bridgeErrorRateHighAlarm = new cloudwatch.Alarm(this, 'BridgeErrorRateHighAlarm', {
      alarmName: `${this.stackName}-error_rate_high`,
      alarmDescription: 'Bridge live alias error rate exceeded threshold during canary deployment',
      metric: new cloudwatch.MathExpression({
        expression: 'IF(invocations > 0, (errors / invocations) * 100, 0)',
        period: cdk.Duration.minutes(1),
        usingMetrics: {
          errors: bridgeAlias.metricErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
          }),
          invocations: bridgeAlias.metricInvocations({
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
          }),
        },
        label: 'BridgeAliasErrorRatePercent',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new codedeploy.LambdaDeploymentGroup(this, 'BridgeCanaryDeploymentGroup', {
      alias: bridgeAlias,
      deploymentConfig: bridgeCanaryPolicy.deploymentConfig,
      alarms: [bridgeErrorRateHighAlarm],
      autoRollback: {
        deploymentInAlarm: true,
        failedDeployment: true,
        stoppedDeployment: true,
      },
    });

    new cdk.CfnOutput(this, 'BridgeCanaryPolicy', {
      description: 'Environment-specific bridge rollout policy',
      value: bridgeCanaryPolicy.summary,
    });

    const authoriserAlias = new lambda.Alias(this, 'AuthoriserLiveAlias', {
      aliasName: 'live',
      version: this.authoriserFn.currentVersion,
      provisionedConcurrentExecutions: 10,
    });

    const platformSpa = new PlatformSpa(this, 'PlatformSpa', {
      envName: env,
      spaDomainName,
      spaCertificateArn,
    });
    this.spaDistribution = platformSpa.spaDistribution;

    const platformApi = new PlatformApi(this, 'PlatformApi', {
      envName: env,
      spaAllowedOrigin: platformSpa.spaAllowedOrigin,
      apiDomainName,
      apiCertificateArn,
      authoriserAlias,
      tenantMgmtFn: this.tenantMgmtFn,
      webhookRegistryFn: this.webhookRegistryFn,
      agentRegistryFn: this.agentRegistryFn,
      adminOpsFn: this.adminOpsFn,
      bridgeAlias,
      webhookDeliveryFn: this.webhookDeliveryFn,
      bffFn: this.bffFn,
    });
    this.api = platformApi.api;

    const platformWaf = new PlatformWaf(this, 'PlatformWaf', {
      api: this.api,
    });
    this.apiWebAcl = platformWaf.apiWebAcl;

    new PlatformGateway(this, 'PlatformGateway', {
      envName: env,
      enforcementMode: gatewayPolicyConfiguration.enforcementMode,
      policyEngineName: gatewayPolicyConfiguration.policyEngineName,
      policyName: gatewayPolicyConfiguration.policyName,
      requestInterceptorFn: this.requestInterceptorFn,
      responseInterceptorFn: this.responseInterceptorFn,
    });

    new ssm.StringParameter(this, 'BridgeLambdaRoleArnParam', {
      parameterName: `/platform/core/${env}/bridge-lambda-role-arn`,
      stringValue: this.bridgeFn.role!.roleArn,
      description: 'IAM role ARN for the Bridge Lambda function',
    });
  }

  private createPythonLambda(props: PythonLambdaProps): lambda.Function {
    const dlq = new sqs.Queue(this, `${props.functionNameSuffix}Dlq`, {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
    });
    this.dlqs[props.functionNameSuffix] = dlq;

    return new lambda.Function(this, `${props.functionNameSuffix}Lambda`, {
      functionName: `${this.stackName}-${props.functionNameSuffix}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: props.handler,
      code: lambda.Code.fromAsset(props.assetPath),
      tracing: lambda.Tracing.ACTIVE,
      deadLetterQueueEnabled: true,
      deadLetterQueue: dlq,
      timeout: props.timeout,
      memorySize: props.memorySize,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.lambdaSecurityGroup],
      environment: {
        LOG_LEVEL: 'INFO',
        ...props.environment,
      },
    });
  }

  private resolveBridgeCanaryPolicy(env: string): BridgeCanaryPolicy {
    switch (env) {
      case 'dev':
        return {
          deploymentConfig: codedeploy.LambdaDeploymentConfig.ALL_AT_ONCE,
          summary: 'dev=all-at-once',
        };
      case 'staging':
        return {
          deploymentConfig: codedeploy.LambdaDeploymentConfig.CANARY_10PERCENT_30MINUTES,
          summary: 'staging=canary-10%-30m',
        };
      case 'prod':
        return {
          deploymentConfig: codedeploy.LambdaDeploymentConfig.CANARY_10PERCENT_15MINUTES,
          summary: 'prod=canary-10%-15m',
        };
      default:
        throw new Error(`Unsupported env context for canary policy: ${env}`);
    }
  }

  private resolveGatewayPolicyConfiguration(env: string): GatewayPolicyConfiguration {
    switch (env) {
      case 'dev':
        return {
          enforcementMode: 'LOG_ONLY',
          policyEngineName: 'PlatformGatewayPolicyEngineDev',
          policyName: 'PlatformGatewayAllowAllDev',
        };
      case 'staging':
        return {
          enforcementMode: 'LOG_ONLY',
          policyEngineName: 'PlatformGatewayPolicyEngineStaging',
          policyName: 'PlatformGatewayAllowAllStaging',
        };
      case 'prod':
        return {
          enforcementMode: 'ENFORCE',
          policyEngineName: 'PlatformGatewayPolicyEngineProd',
          policyName: 'PlatformGatewayAllowAllProd',
        };
      default:
        throw new Error(`Unsupported env context for gateway policy mode: ${env}`);
    }
  }
}
