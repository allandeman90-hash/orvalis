// Playwright entry handed to the legacy tools (tools/play.mjs reads the PLAYWRIGHT
// variable). Same API as playwright-core, plus software-GL flags so the legacy
// WebGL game renders on machines without a GPU. Lets the legacy scenarios run
// without installing anything in, or modifying, the legacy project.
import { chromium as real } from 'playwright-core';

const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
export const chromium = {
  launch: (options = {}) => real.launch({ ...options, channel: undefined, args: [...(options.args ?? []), ...SOFTWARE_GL] }),
};
