/** True on Netlify/AWS Lambda and other ephemeral serverless runtimes. */
export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV?.startsWith('AWS_Lambda_') ||
      process.env.NETLIFY === 'true',
  )
}
