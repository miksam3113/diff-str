/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { v4 as uuidv4 } from "uuid";
import { diffChars } from "diff";

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	DIFFS: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			const { pathname } = new URL(request.url);

			const regExpRout = /^\/diff\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/;

			if (pathname === "/data-upload" && request.method === "POST") {
				const diff_id = uuidv4();
				let diff_message = "";
				const result: { oldData: string; newData: string } = await request.json();

				const oldData = result.oldData.trim().split("\n");
				const newData = result.newData.trim().split("\n");

				if (!result) {
					return new Response("Unexpected end of JSON input", {
						status: 400,
					});
				} else {
					await env.DIFFS.put(diff_id, JSON.stringify(result));

					for (let i = 0; i < oldData.length; i++) {
						const diff = diffChars(oldData[i], newData[i]);

						if (diff.length !== 1) {
							diff_message += `\n${i + 1} - `;
							diff.forEach((oneDiff) => {
								if (oneDiff?.added !== true && oneDiff?.removed !== true) {
									diff_message += `${oneDiff.value}`;
								}
							});
							diff_message += `\n${i + 1} + `;
							diff.forEach((oneDiff) => {
								diff_message += `${oneDiff.value}`;
							});
						}
					}
					if (diff_message !== "") {
						return new Response(`{ "id": "${diff_id}", "message": "${diff_message}" }`, {
							status: 200,
						});
					}
					return new Response("Data not changed", {
						status: 404,
					});
				}
			} else if (regExpRout.test(pathname) && request.method === "GET") {
				const diffId = pathname.match(regExpRout)![1];
				const data = await env.DIFFS.get(diffId);
				let diff_message = "";

				if (data === null) {
					return new Response("Data or Route not found", {
						status: 404,
					});
				} else {
					const oldData = JSON.parse(data).oldData.trim().split("\n");
					const newData = JSON.parse(data).newData.trim().split("\n");

					for (let i = 0; i < oldData.length; i++) {
						const diff = diffChars(oldData[i], newData[i]);
						//console.log(diff);
						if (diff.length === 1) {
							diff_message += `\n ${diff[0].value}`;
						} else {
							diff_message += `\n-`;
							diff.forEach((oneDiff) => {
								if (oneDiff?.added !== true && oneDiff?.removed !== true) {
									diff_message += `${oneDiff.value}`;
								}
							});
							diff_message += `\n+`;
							diff.forEach((oneDiff) => {
								diff_message += `${oneDiff.value}`;
							});
						}
					}

					const html = `
<doctype html>
<html lang="en-us">
<head>
\t<meta charset="utf-8" />
\t<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.7.1/styles/github.min.css" />
\t<link
\t\trel="stylesheet"
\t\ttype="text/css"
\t\thref="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css"
\t/>
\t<style>
\t\tbody {
\t\t\tbackground-color: #FAFBFC;
\t\t}
\t\t.d2h-file-header {
\t\t\tdisplay: none;
\t\t}
\t\t.d2h-info {
\t\t\tfont-size: 21px;
\t\t}
\t\t.d2h-cntx, .d2h-change {
\t\t\tfont-size: 18px;
\t\t}
\t\t.d2h-code-side-linenumber {
\t\t\tborder: none;
\t\t}
\t\ttd.d2h-info div.d2h-code-side-line {
\t\t\tcolor: #535353;
\t\t}
\t</style>
\t<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/diff2html/bundles/js/diff2html-ui.min.js"></script>
</head>
<script>
\tconst customDiffString = \`
--- Old
+++ New
@@ -1,5 +1,5 @@
${diff_message}
\`;

\tdocument.addEventListener('DOMContentLoaded', function () {
\t\tvar targetElement = document.getElementById('myDiffElement');
\t\tvar configuration = {
\t\t\tdrawFileList: false,
\t\t\toutputFormat: 'side-by-side',
\t\t\thighlight: true,
\t\t\trenderNothingWhenEmpty: true,
\t\t};

\t\tvar diff2htmlUi = new Diff2HtmlUI(targetElement, customDiffString, configuration);
\t\tdiff2htmlUi.draw();
\t\tdiff2htmlUi.highlightCode();
\t});
</script>
<body>
<div id="myDiffElement"></div>
<script>
\tdocument.addEventListener('DOMContentLoaded', function () {
\t\tdocument.querySelectorAll("td.d2h-info div.d2h-code-side-line")[0].innerHTML = "Original";
\t\tdocument.querySelectorAll("td.d2h-info div.d2h-code-side-line")[1].innerHTML = "New";

\t});
</script>
</body>
</html>
				`;

					console.log(diffId);

					return new Response(html, {
						headers: {
							"content-type": "text/html;charset=UTF-8",
						},
					});
				}
			} else {
				return new Response("Route not found", {
					status: 404,
				});
			}
		} catch (err) {
			console.error(`KV returned error: ${err}`);
			return new Response(`${err}`, {
				status: 500,
			});
		}
	},
};
