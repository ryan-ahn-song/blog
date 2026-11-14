// Local development uses checked-in assets; production images are served by R2.
const base = import.meta.env.PROD ? 'https://media.21stark.dev' : '/assets';
export const assetUrl = name => `${base}/${name}`;
