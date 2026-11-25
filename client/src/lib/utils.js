export const formatTimestamp = (ts) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const initials = (name) => {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const generateId = () => {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
};

export const sanitizeName = (name) => {
  if (typeof name !== 'string') return '';
  return name.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
};

export const isValidName = (name) => {
  const n = sanitizeName(name);
  return n.length >= 1 && n.length <= 50;
};
