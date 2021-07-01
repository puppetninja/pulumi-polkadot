import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";

/* Params to create the cluster on DigitalOcean */
export interface ClusterParameters {
    project: ClusterProject;
    vpc: ClusterVPC;
    k8s: ClusterKubernetes;
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
export class PolkadotCluster extends pulumi.ComponentResource {
    readonly name: string;
    readonly project: ClusterProject;
    readonly vpc: ClusterVPC;
    readonly k8s: ClusterKubernetes;
    readonly description: string;

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
        
        // project
        const project = new digitalocean.Project(this.project.name, {
            name: this.project.name,
            description: this.project.description,
            environment: this.project.environment,
            purpose: this.project.purpose,
        });

        // vpc
        const vpc = new digitalocean.Vpc(this.vpc.name, {
            name: this.vpc.name,
            region: this.vpc.region,
        });

        // k8s
        const k8s = new digitalocean.KubernetesCluster(this.k8s.name, {
            name: this.k8s.name,
            region: this.k8s.region,
            version: this.k8s.version,
            nodePool: this.k8s.nodePool,
            vpcUuid: vpc.id,
        });

        const projectResourcesName = this.project.name + "-resouces";
        // Create project resources
        const projectResources = new digitalocean.ProjectResources(projectResourcesName, {
            project: project.id,
            resources:[k8s.clusterUrn],
        });
    }

};
