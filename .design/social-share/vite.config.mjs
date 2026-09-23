import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({root:resolve('.design/social-share'),publicDir:resolve('public'),build:{outDir:resolve('.design/social-share/dist'),emptyOutDir:true,rollupOptions:{input:resolve('.design/social-share/fixture.html')}}});
