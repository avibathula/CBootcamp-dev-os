// Few-shot examples embedded in the extraction system prompt (docs/specs/03 §4).
// Each shows a contract excerpt followed by the exact JSON the model should produce.

export const NDA_FEW_SHOT_EXAMPLES = `
Example 1:
Contract excerpt (Page 1):
"This Agreement is entered into as of March 3, 2025 (the "Effective Date") by and between Northwind Robotics, Inc., a Delaware corporation ("Disclosing Party"), and Julian Ferreira ("Receiving Party")."

Expected JSON:
{"terms":[
  {"term_name":"Parties","value":"Northwind Robotics, Inc. and Julian Ferreira","page_number":1,"confidence_score":98,"source_sentence":"This Agreement is entered into as of March 3, 2025 (the \\"Effective Date\\") by and between Northwind Robotics, Inc., a Delaware corporation (\\"Disclosing Party\\"), and Julian Ferreira (\\"Receiving Party\\")."},
  {"term_name":"Effective Date","value":"March 3, 2025","page_number":1,"confidence_score":98,"source_sentence":"This Agreement is entered into as of March 3, 2025 (the \\"Effective Date\\") by and between Northwind Robotics, Inc., a Delaware corporation (\\"Disclosing Party\\"), and Julian Ferreira (\\"Receiving Party\\")."}
]}

Example 2:
Contract excerpt (Page 2):
"The Receiving Party agrees to hold all Confidential Information in strict confidence and shall not disclose it to any third party without prior written consent, for a period of five (5) years following the Effective Date."

Expected JSON:
{"terms":[
  {"term_name":"Confidentiality Obligations","value":"Receiving Party must hold Confidential Information in strict confidence and not disclose to third parties without prior written consent","page_number":2,"confidence_score":92,"source_sentence":"The Receiving Party agrees to hold all Confidential Information in strict confidence and shall not disclose it to any third party without prior written consent, for a period of five (5) years following the Effective Date."},
  {"term_name":"Term & Duration","value":"5 years from the Effective Date","page_number":2,"confidence_score":90,"source_sentence":"...for a period of five (5) years following the Effective Date."}
]}

Example 3 (term not present in the document):
Contract excerpt: document contains no non-solicitation language anywhere.

Expected JSON:
{"terms":[
  {"term_name":"Non-Solicitation","value":null,"page_number":null,"confidence_score":0,"source_sentence":null}
]}
`.trim()

export const MSA_FEW_SHOT_EXAMPLES = `
Example 1:
Contract excerpt (Page 1):
"This Master Service Agreement is made between Carraway Logistics LLC ("Client") and Ferro Consulting Group ("Provider"). Provider shall deliver the services described in each Statement of Work executed under this Agreement."

Expected JSON:
{"terms":[
  {"term_name":"Parties","value":"Carraway Logistics LLC and Ferro Consulting Group","page_number":1,"confidence_score":97,"source_sentence":"This Master Service Agreement is made between Carraway Logistics LLC (\\"Client\\") and Ferro Consulting Group (\\"Provider\\")."},
  {"term_name":"Service Scope","value":"Services described in each Statement of Work executed under this Agreement","page_number":1,"confidence_score":85,"source_sentence":"Provider shall deliver the services described in each Statement of Work executed under this Agreement."}
]}

Example 2:
Contract excerpt (Page 3):
"Client shall pay all undisputed invoices within thirty (30) days of receipt. Late payments accrue interest at 1.5% per month. Provider's total liability under this Agreement shall not exceed the fees paid in the preceding twelve (12) months."

Expected JSON:
{"terms":[
  {"term_name":"Payment Terms","value":"Net 30 days from invoice receipt","page_number":3,"confidence_score":94,"source_sentence":"Client shall pay all undisputed invoices within thirty (30) days of receipt."},
  {"term_name":"Late Payment Penalty","value":"1.5% interest per month","page_number":3,"confidence_score":93,"source_sentence":"Late payments accrue interest at 1.5% per month."},
  {"term_name":"Liability Cap","value":"Fees paid in the preceding 12 months","page_number":3,"confidence_score":90,"source_sentence":"Provider's total liability under this Agreement shall not exceed the fees paid in the preceding twelve (12) months."}
]}

Example 3 (term not present in the document):
Contract excerpt: document contains no dispute resolution clause anywhere.

Expected JSON:
{"terms":[
  {"term_name":"Dispute Resolution","value":null,"page_number":null,"confidence_score":0,"source_sentence":null}
]}
`.trim()
