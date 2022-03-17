import { exec, ExecOptions } from '@actions/exec';

interface NPXCommandOptions {
  command: string[];
  options?: ExecOptions;
}

export const execNpxCommand = async ({
  command,
  options,
}: NPXCommandOptions): Promise<void> => {
  let myOutput = '';
  const exitCode = await exec(`npx`, ['-y', ...command], {
    listeners: {
      stdout: (stdoutData: Buffer) => {
        myOutput += stdoutData.toString();
      },
    },
    ...(options || {}),
  });
  if (exitCode > 0 && myOutput && !myOutput.includes('Success')) {
    throw new Error(myOutput);
  }
};

export const wranglerPublish = async (
  workingDirectory: string,
  environment: string,
  cloudflareAccount: string,
  cfApiToken: string,
  secrets: string[],
) => {
  const wrangler = '@cloudflare/wrangler';

  // Add new environment config to wrangler config file.
  // [env.preview-job-pr-123]
  // name = "env.preview-job-pr-123"
  await exec('sed', ['-i', '-e', `$a[env.${environment}]`, './wrangler.toml'], {
    cwd: workingDirectory,
  });
  await exec(
    'sed',
    ['-i', '-e', `$aname = "${environment}"`, './wrangler.toml'],
    {
      cwd: workingDirectory,
    },
  );

  await execNpxCommand({
    command: [wrangler, 'publish', '-e', environment],
    options: {
      cwd: workingDirectory,
      env: {
        ...process.env,
        CF_API_TOKEN: cfApiToken,
        CF_ACCOUNT_ID: cloudflareAccount,
      },
    },
  });

  for (const secret of secrets) {
    const value = process.env[secret];

    if (!value) {
      throw new Error(`Secret value for ${secret} not found`);
    }

    await execNpxCommand({
      command: [wrangler, 'secret', 'put', secret, '-e', environment],
      options: {
        cwd: workingDirectory,
        env: {
          ...process.env,
          CF_API_TOKEN: cfApiToken,
          CF_ACCOUNT_ID: cloudflareAccount,
        },
        input: Buffer.from(value, 'utf-8'),
      },
    });
  }
};

export const wranglerTeardown = async (
  cloudflareAccount: string,
  cfApiToken: string,
  environment: string,
) => {
  const api = 'https://api.cloudflare.com/client/v4/accounts';
  const url = `${api}/${cloudflareAccount}/workers/scripts/${environment}`;
  const authHeader = `Authorization: Bearer ${cfApiToken}`;

  return await exec('curl', ['-X', 'DELETE', url, '-H', authHeader]);
};

export const formatImage = ({
  buildingLogUrl,
  imageUrl,
}: {
  buildingLogUrl: string;
  imageUrl: string;
}) => {
  return `<a href="${buildingLogUrl}"><img width="300" src="${imageUrl}"></a>`;
};

export const getCommentFooter = () => {
  return '<sub>[cloudflare-workers-preview](https://github.com/shidil/cloudflare-workers-preview)</sub>';
};
