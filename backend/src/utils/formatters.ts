export const truncate = (text: string, length: number) => text.length > length ? text.substring(0, length) + '...' : text;
