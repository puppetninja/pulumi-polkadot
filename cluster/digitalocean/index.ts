import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import { rootPulumiStackTypeName } from "@pulumi/pulumi/runtime";

/* Params to create the cluster on DigitalOcean */
export interface ClusterParameters {
    project: ClusterProject;
    vpc: ClusterVPC;
    k8s: ClusterKubernetes;
    registry: ContainerRegistry;
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

export interface ContainerRegistry {
    name: string;
    subscriptionTierSlug: string;
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
    readonly registry: ContainerRegistry;
    readonly description: string;
    // Provisioned resources refs on DigitalOcean
    readonly doProject: digitalocean.Project;
    readonly doVPC: digitalocean.Vpc;
    readonly doK8s: digitalocean.KubernetesCluster;
    readonly doRegistry: digitalocean.ContainerRegistry;

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
        this.registry = params.registry;
        this.description = params.description;
        
        // project
        this.doProject = new digitalocean.Project(this.project.name, {
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

        // k8s cluster
        this.doK8s = new digitalocean.KubernetesCluster(this.k8s.name, {
            name: this.k8s.name,
            region: this.k8s.region,
            version: this.k8s.version,
            nodePool: this.k8s.nodePool,
            vpcUuid: this.doVPC.id,
        });

        // container registry
        this.doRegistry = new digitalocean.ContainerRegistry(this.registry.name, {
            name: this.registry.name,
            subscriptionTierSlug: this.registry.subscriptionTierSlug,
        });

        // Create project resources
        const projectResourcesName = this.project.name + "-resouces";
        const projectResources = new digitalocean.ProjectResources(projectResourcesName, {
            project: this.doProject.id,
            resources:[this.doK8s.clusterUrn],
        });
    }
};
