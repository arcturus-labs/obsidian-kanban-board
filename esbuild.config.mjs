import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'cjs',
  target: 'es2020',
  outfile: 'main.js',
  sourcemap: 'inline',
  external: ['obsidian', 'electron', '@codemirror/state', '@codemirror/view', '@codemirror/language'],
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx'
  }
});

if (watch) {
  await ctx.watch();
  console.log('watching');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('built');
}
