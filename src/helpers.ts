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
  deployPath: string,
  environment: string,
  cloudflareAccount: string,
  cfApiToken: string,
  secrets: string[],
) => {
  const wrangler = '@cloudflare/wrangler';

  // replace the existing environment and add a name to it
  await exec(
    'sed',
    [
      '-i',
      '-e',
      `s/^\\[env.${environment}\\]/[env.${deployPath}]\\nname = "${deployPath}"/g`,
      './wrangler.toml',
    ],
    {
      cwd: workingDirectory,
    },
  );

  await execNpxCommand({
    command: [wrangler, 'publish', '-e', deployPath],
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
      command: [wrangler, 'secret', 'put', secret, '-e', deployPath],
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
  deployPath: string,
) => {
  const api = 'https://api.cloudflare.com/client/v4/accounts';
  const url = `${api}/${cloudflareAccount}/workers/scripts/${deployPath}`;
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
