import { createApp } from './app.js';

createApp().listen(4000, '127.0.0.1', () => {
  console.info('KairoPass server listening at http://127.0.0.1:4000');
});
