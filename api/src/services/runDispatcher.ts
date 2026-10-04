import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { Types } from 'mongoose';
import { executeRun } from './checkRunner.js';

/**
 * Starts a run that POST /checks/run already created, without waiting for the
 * checks. Resolves once the run has been handed off; rejects if it couldn't be.
 */
export type RunDispatcher = (runId: Types.ObjectId) => Promise<void>;

/**
 * Local server: run the checks in this process after the response is sent.
 * Fine for a long-running server, but not on Lambda, which freezes the
 * function as soon as the response is returned.
 */
export const dispatchInProcess: RunDispatcher = async (runId) => {
  // executeRun already logs and marks the run failed; this only stops an
  // unhandled rejection from crashing the process.
  executeRun(runId).catch(() => undefined);
};

/** Send `payload` to a Lambda function without waiting for it to run. Swappable in tests. */
export type InvokeAsync = (functionName: string, payload: unknown) => Promise<void>;

let lambdaClient: LambdaClient | undefined;

const invokeAsync: InvokeAsync = async (functionName, payload) => {
  // Created on first use and reused by warm invocations. Region and
  // credentials come from the Lambda environment.
  lambdaClient ??= new LambdaClient({});
  // "Event" = asynchronous invoke: Lambda queues the event and answers 202
  // straight away; the checker then runs for up to its own timeout (5 min).
  const res = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  if (res.StatusCode !== 202) {
    throw new Error(`Async invoke of ${functionName} returned status ${res.StatusCode}`);
  }
};

/** On Lambda: hand the run to the checker function (checker-job.ts). */
export function dispatchToLambda(
  functionName: string,
  invoke: InvokeAsync = invokeAsync,
): RunDispatcher {
  return (runId) => invoke(functionName, { runId: String(runId) });
}

/** The checker Lambda when its name is configured (production), otherwise in-process. */
export function createRunDispatcher(checkerFunctionName: string | undefined): RunDispatcher {
  return checkerFunctionName ? dispatchToLambda(checkerFunctionName) : dispatchInProcess;
}
