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

const midlContainerRegistry = {
    name: "midl-polkadot-registry",
    subscriptionTierSlug: "basic",
};

// Create polkadot cluster on digitalocean.
const polkadotCluster = new docluster.MIDLCluster("midl-polkadot-cluster", {
    project: midlProject,
    vpc: midlVPC,
    lb: midlLoadBalancer,
    k8s: midlKubernetes,
    registry: midlContainerRegistry,
    description: "Cluster on digitalocean to host polkadot/ksm validators."
});

// Build docker containers and push to registry on DO
const registry = polkadotCluster.doRegistry;
const registryCreds = new digitalocean.ContainerRegistryDockerCredentials(`${midlContainerRegistry.name}-creds`, {
        registryName: midlContainerRegistry.name,
        write: true,
    }, {
        dependsOn: [registry]
    });

const registryInfo = pulumi.all(
    [registryCreds.dockerCredentials, registry.serverUrl]
).apply(([authJson, serverUrl]) => {
    // We are given a Docker creds file; parse it to find the temp username/password.
    const auths = JSON.parse(authJson);
    const authToken = auths["auths"][serverUrl]["auth"];
    const decoded = Buffer.from(authToken, "base64").toString();
    const [username, password] = decoded.split(":");
    if (!password || !username) {
        throw new Error("Invalid credentials");
    }
    return {
        server: serverUrl,
        username: username,
        password: password,
    };
});

const archiveDownloaderImageName = polkadotCluster.doRegistry.endpoint.apply(s => `${s}/polkadot-archive-downloader`);
const nodeKeyConfiguratorImageName = polkadotCluster.doRegistry.endpoint.apply(s => `${s}/polkadot-node-key-configurator`);

const archiveDownloaderImage = new docker.Image("polkadot-archive-downloader-img", {
    imageName: archiveDownloaderImageName,
    build: "polkadot-archive-downloader",
    registry: registryInfo,
});

const nodeKeyConfiguratorImage = new docker.Image("polkadot-node-key-configurator-img", {
    imageName: nodeKeyConfiguratorImageName,
    build: "polkadot-node-key-configurator",
    registry: registryInfo,
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
            "polkadot_archive_downloader": archiveDownloaderImageName,
            "polkadot_node_key_configurator": nodeKeyConfiguratorImageName,
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
