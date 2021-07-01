# pulumi-polkadot

This is the repo to target [this midl polkadot goal](https://github.com/midl-dev/polkadot-k8s/issues/6)

To bring up the polkadot on digitalocean, specify the cluster to be imported in `index.ts`

> default region VPC can't be deleted via API, manually create an empty one before running any pulumi stack management to ease ops.

once you create a default VPC, run following to bring up the stack.

```sh
pulumi config set digitalocean:token [YOUR DO TOKEN] --secret
pulumi up
```
