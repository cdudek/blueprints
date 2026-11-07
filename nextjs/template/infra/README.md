# infra/

Optional. Infrastructure as code (Terraform, Pulumi, a platform's own config) that belongs to this
app alone: its container services, its database, its secrets and its scheduler.

Keep it here when the app's team owns and changes it together with the code. Keep it in a
separate infrastructure repository when several apps share it, when another team owns it, or when
its change and review cadence differs from the app's. In that case this folder stays empty and
this README links to where the infrastructure lives.

Whatever runs the app follows ARCHITECTURE.md section 12: one image built once and promoted,
migrations as a job before the traffic shift, a worker process for background work, and the
same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on every instance.
