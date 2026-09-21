import { handleFetchPage } from './_lib/fetchPage.mjs'

export const config = { maxDuration: 20 }

export default async function handler(req, res) {
  await handleFetchPage(req, res)
}
