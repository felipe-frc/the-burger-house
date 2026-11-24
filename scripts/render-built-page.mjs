import handler from "../.vercel/output/functions/__server.func/index.mjs";
const response = await handler.fetch(new Request(`http://localhost${process.argv[2] ?? "/"}`), {});
if (response.status !== 200) throw new Error(`SSR returned ${response.status}`);
process.stdout.write(await response.text());
