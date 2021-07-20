import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import * as digitalocean from "@pulumi/digitalocean";
import * as kubernetes from "@pulumi/kubernetes";

import * as docluster from "./cluster/digitalocean";
import { Project } from "@pulumi/digitalocean";

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
        size: "s-4vcpu-8gb",
        nodeCount: 1,
    },
};

// Create polkadot cluster on digitalocean.
const polkadotCluster = new docluster.MIDLCluster("midl-polkadot-cluster", {
    project: midlProject,
    vpc: midlVPC,
    k8s: midlKubernetes,
    description: "Cluster on digitalocean to host polkadot/ksm validators."
});

// Get k8s config
const kubecluster = polkadotCluster.doK8s;
const kubeconfig = kubecluster.kubeConfigs[0].rawConfig;
const provider = new kubernetes.Provider("do-k8s", { kubeconfig });

const promNS = new kubernetes.core.v1.Namespace("prometheus-ns", {
    metadata: {
        name: "prometheus",
    }
},{
    provider: provider,
    dependsOn: [provider, kubecluster]
});

const prometheus = new kubernetes.helm.v3.Chart("prometheus-stack", {
    chart: "kube-prometheus-stack",
    fetchOpts:{
        repo: "https://prometheus-community.github.io/helm-charts",
    },
    values: {
        kubeApiServer: {
            enabled: false
        },
        kubelet: {
            enabled: false
        },
        kubeControllerManager: {
            enabled: false
        },
        coreDns: {
            enabled: false
        },
        kubeDns: {
            enabled: true
        },
        kubeEtcd: {
            enabled: false
        },
        kubeScheduler: {
            enabled: false
        },
        kubeProxy: {
            enabled: false
        },
        nodeExporter: {
            // enabled: true,
            hostNetwork: false,
        }
    },
    namespace: promNS.metadata.name
},{
    provider: provider,
    dependsOn: [promNS, provider, kubecluster],
});
