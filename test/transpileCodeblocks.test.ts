import unified from 'unified';
import remarkParser from 'remark-parse';
// @ts-ignore
import mdxPlugin from 'remark-mdx';
import remarkStringify from 'remark-stringify';
import { transpileCodeblocks, TranspileCodeblocksSettings } from '../src';
import { resolve } from 'path';

expect.addSnapshotSerializer({
  test(value) {
    return value && value.type;
  },
  print(value, serialize) {
    if (value.type === 'code') {
      return '```' + value.lang + '\n' + value.value + '\n```';
    }
    return value.children
      ? value.children.map(serialize).join('\n')
      : value.value;
  },
});

const defaultSettings: TranspileCodeblocksSettings = {
  compilerSettings: {
    tsconfig: resolve(__dirname, '..', 'tsconfig.tests.json'),
    externalResolutions: {
      'remark-typescript-tools': {
        resolvedPath: resolve(__dirname, '..', 'src'),
        packageId: {
          name: 'remark-typescript-tools',
          subModuleName: '',
          version: '1.0',
        },
      },
    },
  },
};

function getParser(settings = defaultSettings) {
  return unified()
    .use(remarkParser)
    .use(mdxPlugin)
    .use(transpileCodeblocks, settings)
    .use(remarkStringify);
}

function transform(md: string) {
  const parser = getParser();
  return parser.run(parser.parse(md), {
    path: __dirname + '/test.mdx',
  });
}

test('transpiles codeblocks', async () => {
  const md = `
\`\`\`ts
function testFn(arg1: string) {
    return arg1;
}
\`\`\`
`;

  expect(await transform(md)).toMatchSnapshot();
});

test('inserts imports for Tabs & TabItem', async () => {
  const md = `
# some-pararaph
`;

  expect(await transform(md)).toMatchInlineSnapshot(`
    import TabItem from '@theme/TabItem'
    import Tabs from '@theme/Tabs'
    some-pararaph
  `);
});

test('skips imports that are already present', async () => {
  const md = `
# some-pararaph

import Tabs from '@theme/Tabs'
`;

  expect(await transform(md)).toMatchInlineSnapshot(`
    import TabItem from '@theme/TabItem'
    some-pararaph
    import Tabs from '@theme/Tabs'

  `);
});

test('throws an error on compilation error', async () => {
  const md = `
\`\`\`ts
let x: string = 5
\`\`\`
`;

  return expect(
    transform(md).catch((e) => {
      throw e.toString();
    })
  ).rejects.toContain(
    `remark-typescript-tools/test/test.mdx:2:1-4:4: Type '5' is not assignable to type 'string'.`
  );
});

test('no-transpile does not throw an error and does add tabs', async () => {
  const md = `
\`\`\`ts no-transpile
let x: string = 5
\`\`\`
`;

  return expect(transform(md)).resolves.toMatchInlineSnapshot(`
    import TabItem from '@theme/TabItem'
    import Tabs from '@theme/Tabs'
    \`\`\`ts
    let x: string = 5
    \`\`\`
  `);
});

test('transpiles codeblocks with multiple file definitions', async () => {
  const md = `
\`\`\`ts
// file: file1.ts
export function testFn(arg1: string) {
    return arg1;
}
// file: file2.ts
import { testFn } from './file1'

console.log(testFn("foo"))
\`\`\`
`;

  expect(await transform(md)).toMatchSnapshot();
});

test('finds error spanning over multiple files', async () => {
  const md = `
\`\`\`ts
// file: file1.ts
export function testFn(arg1: string) {
    return arg1;
}
// file: file2.ts
import { testFn } from './file1'

console.log(testFn(5))
\`\`\`
`;

  return expect(
    transform(md).catch((e) => {
      throw e.toString();
    })
  ).rejects
    .toContain(`/remark-typescript-tools/test/test.mdx/codeBlock_1/file2.ts
Argument of type '5' is not assignable to parameter of type 'string'.`);
});

test('takes "noEmit" files into account for compiling, but does not output them', async () => {
  const md = `
\`\`\`ts
// file: file1.ts noEmit
export function testFn(arg1: string) {
    return arg1;
}
// file: file2.ts
import { testFn } from './file1'

console.log(testFn("foo"))
\`\`\`
`;

  expect(await transform(md)).toMatchSnapshot(
    'file1.ts should be missing from this snapshot'
  );
});

test('reports errors in "noEmit" files', async () => {
  const md = `
\`\`\`ts
// file: file1.ts noEmit
export function testFn(arg1: string) {
    let x: number = arg1;
    return x;
}
// file: file2.ts
import { testFn } from './file1'

console.log(testFn("foo"))
\`\`\`
`;

  return expect(
    transform(md).catch((e) => {
      throw e.toString();
    })
  ).rejects
    .toContain(`remark-typescript-tools/test/test.mdx/codeBlock_1/file1.ts
Type 'string' is not assignable to type 'number'.`);
});

test('supports hyphens & periods in filenames', async () => {
  const md = `
\`\`\`ts
// file: file-one.stuff.ts noEmit
export function testFn(arg1: string) {
    return arg1;
}
// file: file2.ts
import { testFn } from './file-one.stuff'

console.log(testFn("foo"))
\`\`\`
`;

  return expect(transform(md)).resolves.toMatchSnapshot();
});
