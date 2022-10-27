import { exec, ExecOptions } from '@actions/exec';

interface NPXCommandOptions {
  command: string[];
  options?: ExecOptions;
}

export const execNpxCommand = async ({
  command,
  options,
}: NPXCommandOptions): Promise<string> => {
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
  return myOutput;
};

const wrangler = '@cloudflare/wrangler';

export const wranglerPublish = async (
  workingDirectory: string,
  deployPath: string,
  environment: string,
  cloudflareAccount: string,
  cfApiToken: string,
  secrets: string[],
) => {
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
  workingDirectory: string,
  cloudflareAccount: string,
  cfApiToken: string,
  deployPath: string,
) => {
  const api = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccount}`;
  const authHeader = `Authorization: Bearer ${cfApiToken}`;

  await exec('curl', [
    '-X',
    'DELETE',
    `${api}/workers/scripts/${deployPath}`,
    '-H',
    authHeader,
  ]);

  const namespaceText = await execNpxCommand({
    command: [wrangler, 'kv:namespace', 'list'],
    options: {
      cwd: workingDirectory,
      env: {
        ...process.env,
        CF_API_TOKEN: cfApiToken,
        CF_ACCOUNT_ID: cloudflareAccount,
      },
    },
  });

  const matches = namespaceText.replace(/\s/g, '').match(/\[{.+}\]/);

  if (!matches) {
    throw new Error('No matching namespaces found');
  }

  const kvNamespaces = JSON.parse(matches[0]) as {
    id: string;
    title: string;
  }[];

  const namespace = kvNamespaces.find(
    n => n.title === `__${deployPath}-workers_sites_assets`,
  );

  if (!namespace) {
    throw new Error('No KV namespace found');
  }

  return await exec('curl', [
    '-X',
    'DELETE',
    `${api}/storage/kv/namespaces/${namespace.id}`,
    '-H',
    authHeader,
  ]);
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
