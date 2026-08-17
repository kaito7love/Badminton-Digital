import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
// Nạp sau Tailwind: nút/thẻ của bộ nhận diện phải thắng utility class cùng độ
// ưu tiên, và mọi trang khách dùng chung một bản chứ không mỗi chunk một bản.
import './styles/kinetic.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
