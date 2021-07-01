import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";

import * as docluster from "./cluster/digitalocean";

// Define facts for the midl polkadot cluster.
const midlProject = {
    name: "midl-polkadot",
    description: "Project to confine midl polkadot/ksm resources",
    environment: "Production",
    purpose: "Other",
};

const midlVPC = {
    name: "midl-polkadot-vpc",
    region: "ams3",
};

const midlKubernetes = {
    name: "midl-polkadot-k8s",
    version: "1.21.2-do.2",
    region: "ams3",
    nodePool: {
        name: "midl-polkadot-nodes",
        // size could be found via do url:
        // https://cloud.digitalocean.com/kubernetes/clusters/new?i=xxxx&nodePools=s-4vcpu-8gb:1&clusterVersion=1.21.2-do.2&region=nyc1
        size: "s-2vcpu-4gb",
        nodeCount: 1,
    },
};

const midlContainerRegistry = {
    name: "midl-polkadot-registry",
    subscriptionTierSlug: "basic",
};

// Create polkadot cluster on digitalocean.
const polkadotCluster = new docluster.PolkadotCluster("midl-polkadot-cluster",
    {
        project: midlProject,
        vpc: midlVPC,
        k8s: midlKubernetes,
        description: "Cluster on digitalocean to host polkadot/ksm validators."
    });

// Build docker containers and push to registry on DO


// Deploy helm charts on k8s cluster on DO
