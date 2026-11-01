import { defineEventHandler, setHeader } from 'h3';
import { getThemeInitScript } from '@agent-native/core/client/theme';
import { getLocaleInitScript } from '@agent-native/core/client/i18n';
// Public boot asset; contains only framework-generated theme/locale initialization.
// External async scripts are managed by React's resource loader on client navigation.
export default defineEventHandler(event => {
  setHeader(event, 'Content-Type', 'text/javascript; charset=utf-8');
  setHeader(event, 'Cache-Control', 'no-cache');
  return `${getThemeInitScript()}\n${getLocaleInitScript()}`;
});
