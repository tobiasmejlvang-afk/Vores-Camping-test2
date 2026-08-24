import { createRoot } from 'react-dom/client';
import CampingApp from '../app/CampingApp';
import PwaRegister from '../app/PwaRegister';
import '../app/globals.css';

const root = document.getElementById('root');

if (!root) throw new Error('Appens rodelement mangler.');

createRoot(root).render(
  <>
    <PwaRegister />
    <CampingApp />
  </>,
);
