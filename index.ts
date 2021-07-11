import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import * as digitalocean from "@pulumi/digitalocean";
import * as kubernetes from "@pulumi/kubernetes";

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

const midlLoadBalancer = {
    name: "midl-polakdot-lb",
    region: "ams3",
    forwardingRules: [{
        entryPort: 31333,
        entryProtocol: "tcp",
        targetPort: 31333,
        targetProtocol: "tcp",
    }],
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
    lb: midlLoadBalancer,
    k8s: midlKubernetes,
    description: "Cluster on digitalocean to host polkadot/ksm validators."
});

// Deploy helm charts on k8s cluster on DO
// Declarations of validators.
// Get Loadbalancer ip
const lb = polkadotCluster.doLoadBalancer;
const lbIP = lb.ip;
// Get k8s config
const kubecluster = polkadotCluster.doK8s;
const kubeconfig = kubecluster.kubeConfigs[0].rawConfig;
const provider = new kubernetes.Provider("do-k8s", { kubeconfig });

// Polkadot validators
const testValidatorNamespace = new kubernetes.core.v1.Namespace("test-validator-ns", {
    metadata: {
        name: "test-validator-ns",
    }
},{
    provider: provider,
    dependsOn: [provider, kubecluster]
});

const midlPolkaValidator01 = new kubernetes.helm.v3.Chart("midl-polkadot-test-validtor", {
    path: "./charts/polkadot/",
    values: {
        "images": {
            "polkadot_node": "parity/polkadot:v0.9.8",
        },
        "polkadot_k8s_images": {
            "polkadot_archive_downloader": "midl/polkadot_archive_downloader",
            "polkadot_node_key_configurator": "midl/polkadot_node_key_configurator",
        },
        "polkadot_archive_url": "https://ksm-rocksdb.polkashots.io/snapshot",
        "chain": "kusama",
        "polkadot_validator_name": "midl-polkadot-test-validtor",
        "p2p_ip": lbIP,
        "p2p_port": 31333
    },
    // Intetegrated registry 401 error with new created ns
    // namespace: testValidatorNamespace.metadata.name,
},{
    provider: provider,
    dependsOn: [testValidatorNamespace, provider, kubecluster],
});
