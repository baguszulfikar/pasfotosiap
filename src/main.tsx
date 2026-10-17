import { render } from 'preact';
import { App } from './App';
import { findPreset } from './presets';
import { trackPageView } from './track';
import './styles.css';

const root = document.getElementById('app')!;
// Landing pages set data-preset; links can also use ?preset=cpns.
const presetId = root.dataset.preset || new URLSearchParams(location.search).get('preset');
render(<App initialPreset={findPreset(presetId)} />, root);
trackPageView();
