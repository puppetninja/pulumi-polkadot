import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import { rootPulumiStackTypeName } from "@pulumi/pulumi/runtime";

/* Params to create the cluster on DigitalOcean */
export interface ClusterParameters {
    project: ClusterProject;
    vpc: ClusterVPC;
    k8s: ClusterKubernetes;
    doToken: string;
    description: string;
};

export interface ClusterProject {
    name: string;
    description: string;
    environment: string;
    purpose: string;
};

export interface ClusterVPC {
    name: string;
    region: string;
};

export interface ClusterKubernetesNodes {
    name: string;
    size: string;
    nodeCount: number;
 };

export interface ClusterKubernetes {
    name: string;
    version: string;
    region: string;
    nodePool: ClusterKubernetesNodes;
};

/*
 *  PolkadotCluster indicates a combination of resources on digital ocean to run polkadot validators.
 *  It contains the provisioning of following components:
 *    1. DigitalOcean project to confine the cluster.
 *    2. DigitalOcean networking VPC.
 *    3. DigitalOcean k8s cluster
 *    4. DigitalOcean registry which integrates the k8s cluster provisioned
 */
export class MIDLCluster extends pulumi.ComponentResource {
    readonly name: string;
    readonly project: ClusterProject;
    readonly vpc: ClusterVPC;
    readonly k8s: ClusterKubernetes;
    readonly description: string;
    readonly doToken: string;

    // Provisioned resources on digitalocean
    readonly doVPC: digitalocean.Vpc;
    readonly doK8s: digitalocean.KubernetesCluster;
    readonly doKubeconfig: pulumi.Output<string>;

    // constructor to provision resources on digitalocean
    constructor(name: string,
                params: ClusterParameters,
                opts?: pulumi.ResourceOptions ) {

        const inputs: pulumi.Inputs = {
            options: opts,
        };
        super("midl:components:PolkadotCluster", name, inputs, opts);

        this.name = name;
        this.project = params.project;
        this.vpc = params.vpc;
        this.k8s = params.k8s;
        this.description = params.description;
        this.doToken = params.doToken;
        
        // project
        const project = new digitalocean.Project(this.project.name, {
            name: this.project.name,
            description: this.project.description,
            environment: this.project.environment,
            purpose: this.project.purpose,
        });

        // vpc
        this.doVPC = new digitalocean.Vpc(this.vpc.name, {
            name: this.vpc.name,
            region: this.vpc.region,
        });

        // k8s cluster created within cluster VPC.
        this.doK8s = new digitalocean.KubernetesCluster(this.k8s.name, {
            name: this.k8s.name,
            region: this.k8s.region,
            version: this.k8s.version,
            nodePool: this.k8s.nodePool,
            vpcUuid: this.doVPC.id,
        },{ dependsOn: [this.doVPC] });

        // The kubeconfig passed by the API expires 7 days after cluster creation
        // To go around the problem, we create our own kubeconfig
        // This trick was found here:
        // https://github.com/pulumi/pulumi-digitalocean/issues/78
        this.doKubeconfig = pulumi.interpolate`apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${this.doK8s.kubeConfigs[0].clusterCaCertificate}
    server: ${this.doK8s.endpoint}
  name: ${this.doK8s.name}
contexts:
- context:
    cluster: ${this.doK8s.name}
    user: ${this.doK8s.name}-admin
  name: ${this.doK8s.name}
current-context: ${this.doK8s.name}
kind: Config
users:
- name: ${this.doK8s.name}-admin
  user:
    token: ${this.doToken}
`;

        // Create project resources
        const projectResourcesName = this.project.name + "-resouces";
        const projectResources = new digitalocean.ProjectResources(projectResourcesName, {
            project: project.id,
            resources:[
                this.doK8s.clusterUrn
            ],
        },{ dependsOn: [this.doK8s] });
    }
};
