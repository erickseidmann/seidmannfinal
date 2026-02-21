declare module 'node-cron' {
  export function schedule(
    cronExpression: string,
    task: () => void | Promise<void>,
    options?: { scheduled?: boolean }
  ): { stop: () => void }
}
