const BASE_URL = "http://YOUR_SERVER_IP:3000";

export async function fetchSO(soNumber) {
  const res = await fetch(`${BASE_URL}/so/${soNumber}`);
  return await res.json();
}

export async function checkSO(soNumber) {
  const res = await fetch(`${BASE_URL}/so/check/${soNumber}`);
  return await res.json();
}