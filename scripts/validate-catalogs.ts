import { CATALOG_VERSION } from '../packages/catalogs/src/index';
if (!CATALOG_VERSION) throw new Error('Missing catalog contract');
console.log('Catalog package initialized; real dataset validation follows T002.');
