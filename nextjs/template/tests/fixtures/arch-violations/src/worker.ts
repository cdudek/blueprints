// the worker process: the one root that calls operations, here a job operation
import { sweepFromJob } from "@/modules/billing/server";
export const tasks = { sweep: () => sweepFromJob() };
