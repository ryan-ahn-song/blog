import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { assetUrl } from './assets.js';
document.querySelector('link[rel="icon"]').href = assetUrl('logo_alone_light-1.svg');
createRoot(document.getElementById('root')).render(<App />);
