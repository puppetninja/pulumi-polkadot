# pulumi-polkadot

This is the repo to target [this midl polkadot goal](https://github.com/midl-dev/polkadot-k8s/issues/6)

To bring up the polkadot on digitalocean, specify the cluster to be imported in `index.ts`

Several issues so far:

* default region VPC can't be deleted via API, manually create an empty one before running any pulumi stack management to ease ops.

* DigitalOcean API doesn't support the integration between container registry and k8s cluster, so either build the docker image independently and push them to docker hub, or manually integrate the container registry and k8s cluster in dashboard in initial provision before provisoning k8s with helm.

Once you create a default VPC and get the registry set, run following to bring up the stack.

```sh
pulumi config set digitalocean:token [YOUR DO TOKEN] --secret
pulumi up
```
