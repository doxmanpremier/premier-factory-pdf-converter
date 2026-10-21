import React from 'react';
import {createRoot} from 'react-dom/client';
import Desk from './desk';
import './globals.css';
import './light.css';
import './workspace-improvements.css';
createRoot(document.getElementById('root')!).render(<Desk/>);
