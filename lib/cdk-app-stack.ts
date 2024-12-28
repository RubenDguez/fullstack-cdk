import * as cdk from 'aws-cdk-lib';
import {
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  KeyPair,
  MachineImage,
  OperatingSystemType,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc
} from 'aws-cdk-lib/aws-ec2';
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class CdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const instanceType = InstanceType.of(InstanceClass.T3, InstanceSize.MICRO);
    const engine = DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_17 });
    const port = 5432;
    const dbName = 'archive_db';

    // create database master user secret and store it in Secrets Manager
    const masterUserSecret = new Secret(this, 'db-master-user-secret', {
      secretName: 'db-master-user-secret',
      description: 'Database master user credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        passwordLength: 16,
        excludePunctuation: true,
      },
    });

    // create default vpc
    const vpc = new Vpc(this, 'default-vpc', { maxAzs: 2 });

    // create db security group
    const securityGroup = new SecurityGroup(this, 'database-sg', {
      securityGroupName: 'database-sg',
      vpc: vpc,
    });

    // add db inbound rule
    securityGroup.addIngressRule(Peer.ipv4(vpc.vpcCidrBlock), Port.tcp(port), `Allow port ${port} for database connection from only within the VPC (${vpc.vpcId})`);

    // add ec2 inbound rule on port 80
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), `Allow port 80 for EC2 HTTP connection`);

    // add ec2 inbound rule on port 80
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(443), `Allow port 443 for EC2 HTTPS`);

    // add ec2 inbound rule on port 22 for ssh
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22), `Allow port 22 for EC2 SSH connection`);

    // UBUNTU machine image
    const machineImage = MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id', { os: OperatingSystemType.LINUX });

    // Create RDS Instance (PostgreSQL)
    const dbInstance = new DatabaseInstance(this, 'postgresql-db-1', {
      vpc: vpc,
      // vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      instanceType,
      engine,
      port,
      securityGroups: [securityGroup],
      databaseName: dbName,
      credentials: Credentials.fromSecret(masterUserSecret),
      backupRetention: cdk.Duration.days(0),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Attach Key Pair to channel through SSH
    const keyPair = KeyPair.fromKeyPairName(this, 'EC2KeyPair', 'EC2KeyPair');

    // Create Full-Stack host EC2
    const fullStackEc2Instance = new Instance(this, 'full-stack-ec2', {
      vpc,
      keyPair,
      machineImage,
      instanceType,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
      },
    });

    // attach security group to the fullstack ec2 instance
    fullStackEc2Instance.addSecurityGroup(securityGroup);
  }
}
