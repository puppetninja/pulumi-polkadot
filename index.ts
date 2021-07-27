import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import * as digitalocean from "@pulumi/digitalocean";
import * as kubernetes from "@pulumi/kubernetes";

import * as docluster from "./cluster/digitalocean";
import { Project } from "@pulumi/digitalocean";

const getEnvVariable = (name: string): string => {
    const env = process.env[name];
    if (!env) {
      pulumi.log.error(`${name} environment variable is not set`);
      throw Error;
    }
    return env;
    };

const slackApiURL = getEnvVariable('SLACK_API_URL');
const doToken = getEnvVariable('DIGITALOCEAN_TOKEN');

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
    doToken: doToken,
    description: "Cluster on digitalocean to host polkadot/ksm validators."
});

// Get k8s config
const kubecluster = polkadotCluster.doK8s;
const kubeconfig = polkadotCluster.doKubeconfig;
const provider = new kubernetes.Provider("do-k8s", { kubeconfig });

//////////////
// Monitoring
/////////////
const alertTitle = '[{{ .Status | toUpper }}{{ if eq .Status "firing" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .CommonLabels.alertname }} for {{ .CommonLabels.job }}'
const alertText = `{{ range .Alerts -}}
*Alert:* {{ .Annotations.title }}{{ if .Labels.severity }} - {{ .Labels.severity }}{{ end }}

*Description:* {{ .Annotations.description }}

*Details:*
  {{ range .Labels.SortedPairs }} • *{{ .Name }}:* {{ .Value }}
  {{ end }}
{{ end }}
`
const alertmanagerConfig = {
    global: {
      slack_api_url: `${slackApiURL}`,
      resolve_timeout: '5m',
    },
    route: {
      group_by: ['alertname', 'service'],
      group_wait: '30s',
      group_interval: '5m',
      repeat_interval: '12h',
      receiver: 'null',
      routes: [
        {
            match: {
                alertname: 'Watchdog',
            },
        }
      ],
    },
    receivers: [
        {
            name: "null"
        },{
            name: 'midl_slack',
            slack_configs: [
                {
                    channel: '#infra',
                    send_resolved: true,
                    icon_url: 'https://avatars3.githubusercontent.com/u/3380462',
                    title: alertTitle,
                    text: alertText,
                }
            ],
        }
    ]
}

const monitorNodePool = "midl-polkadot-nodes"
const monitorNodeSelectorSpec = {
    "doks.digitalocean.com/node-pool": monitorNodePool
}

const monitorNamespace = new kubernetes.core.v1.Namespace("monitoring", {
    metadata: {
        name: "monitoring",
    }
},{
    provider: provider,
    dependsOn: [provider, kubecluster]
});

const monitorStack = new kubernetes.helm.v3.Chart("monitoring", {
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
        },
        alertmanager: {
            config: alertmanagerConfig,
            alertmanagerSpec: {
                nodeSelector: monitorNodeSelectorSpec
            },
        },
        prometheusOperator: {
            nodeSelector: monitorNodeSelectorSpec
        }
    },
    namespace: monitorNamespace.metadata.name
},{
    provider: provider,
    dependsOn: [monitorNamespace, provider, kubecluster],
});
