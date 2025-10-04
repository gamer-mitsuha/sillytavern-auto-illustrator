import './style.css';
import message from './index.html';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Popup } = (globalThis as any).SillyTavern.getContext();

Popup.show.text(message);
