// Public job page for a vendor (see pages/IssueBrief.jsx).
export const issueBriefLink = (iss) => (iss?.brief_token ? `https://app.vaad1.co.il/brief/${iss.brief_token}` : '')
