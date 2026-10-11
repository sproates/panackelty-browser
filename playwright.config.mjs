import {defineConfig} from '@playwright/test';
const port=Number(process.env.PLAYGROUND_TEST_PORT || 4174);
export default defineConfig({
  testDir:'tests',testMatch:'browser.test.mjs',timeout:30000,workers:1,
  use:{baseURL:`http://127.0.0.1:${port}`,trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'firefox',use:{browserName:'firefox'}},{name:'webkit',use:{browserName:'webkit',viewport:{width:390,height:844}}}],
  webServer:{command:'node server.mjs',url:`http://127.0.0.1:${port}`,reuseExistingServer:false}
});
