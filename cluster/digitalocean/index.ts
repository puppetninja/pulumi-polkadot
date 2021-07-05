import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import { rootPulumiStackTypeName } from "@pulumi/pulumi/runtime";

/* Params to create the cluster on DigitalOcean */
export interface ClusterParameters {
    project: ClusterProject;
    vpc: ClusterVPC;
    lb: ClusterLoadBalancer;
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

export interface ClusterLoadBalancer {
    name: string;
    region: string;
    forwardingRules: Array<any>;
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
export class MIDLCluster extends pulumi.ComponentResource {
    readonly name: string;
    readonly project: ClusterProject;
    readonly vpc: ClusterVPC;
    readonly lb: ClusterLoadBalancer;
    readonly k8s: ClusterKubernetes;
    readonly registry: ContainerRegistry;
    readonly description: string;

    // Provisioned resources on digitalocean
    readonly doVPC: digitalocean.Vpc;
    readonly doLoadBalancer: digitalocean.LoadBalancer;
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
        this.lb = params.lb;
        this.k8s = params.k8s;
        this.registry = params.registry;
        this.description = params.description;
        
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

        // container registry
        this.doRegistry = new digitalocean.ContainerRegistry(this.registry.name, {
            name: this.registry.name,
            subscriptionTierSlug: this.registry.subscriptionTierSlug,
        });

        // k8s cluster created within cluster VPC.
        this.doK8s = new digitalocean.KubernetesCluster(this.k8s.name, {
            name: this.k8s.name,
            region: this.k8s.region,
            version: this.k8s.version,
            nodePool: this.k8s.nodePool,
            vpcUuid: this.doVPC.id,
        },{ dependsOn: [this.doVPC, this.doRegistry] });

        // loadbalancer
        this.doLoadBalancer = new digitalocean.LoadBalancer(this.lb.name, {
            name: this.lb.name,
            forwardingRules: this.lb.forwardingRules,
            region: this.lb.region,
            vpcUuid: this.doVPC.id,
        },{ dependsOn: [this.doVPC] });

        // Create project resources
        const projectResourcesName = this.project.name + "-resouces";
        const projectResources = new digitalocean.ProjectResources(projectResourcesName, {
            project: project.id,
            resources:[
                this.doK8s.clusterUrn,
                this.doLoadBalancer.loadBalancerUrn,
            ],
        }, { dependsOn: [this.doK8s, this.doLoadBalancer] });
    }
};
