import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  sourcemap: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: {
    '.jsx': 'jsx',
    '.css': 'text'
  },
  define: {
    'process.env.NODE_ENV': '"development"'
  }
};

// Content and popup use IIFE format
const contentOptions = {
  ...commonOptions,
  entryPoints: {
    'content': 'src/content/index.jsx',
    'popup': 'src/popup/index.jsx'
  },
  outdir: 'dist',
  format: 'iife'
};

// Background service worker needs ESM format for "type": "module"
const backgroundOptions = {
  ...commonOptions,
  entryPoints: ['src/background/index.js'],
  outfile: 'dist/background.js',
  format: 'esm'
};

async function build() {
  if (isWatch) {
    const [contentCtx, bgCtx] = await Promise.all([
      esbuild.context(contentOptions),
      esbuild.context(backgroundOptions)
    ]);
    await Promise.all([contentCtx.watch(), bgCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(contentOptions),
      esbuild.build(backgroundOptions)
    ]);
    console.log('Build complete');
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
