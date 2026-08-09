export const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AS','American Samoa'],['AZ','Arizona'],['AR','Arkansas'],['AA','Armed Forces Americas'],['AE','Armed Forces Europe'],['AP','Armed Forces Pacific'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['GU','Guam'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['MP','Northern Mariana Islands'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['PR','Puerto Rico'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UM','United States Minor Outlying Islands'],['UT','Utah'],['VT','Vermont'],['VI','Virgin Islands'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
] as const

const COUNTRY_CODES = [
  'US','CA','MX','GB','AU','NZ','IE','FR','DE','ES','IT','PT','NL','BE','CH','AT','SE','NO','DK','FI','IS','PL','CZ','SK','HU','RO','BG','GR','HR','SI','RS','UA','TR','IL','AE','SA','QA','KW','BH','OM','IN','PK','BD','LK','NP','CN','HK','TW','JP','KR','SG','MY','TH','VN','PH','ID','ZA','NG','KE','GH','EG','MA','DZ','TN','ET','TZ','UG','RW','BR','AR','CL','CO','PE','EC','UY','PY','BO','VE','CR','PA','GT','HN','SV','NI','DO','JM','TT','BS','BB','BZ','GY','SR','PR','VI','GU','AS','MP','FJ','PG','WS','TO','VU','SB','FM','MH','PW','RU','GE','AM','AZ','KZ','UZ','KG','TJ','MD','AL','MK','BA','ME','CY','MT','LU','LI','MC','SM','VA','AD','EE','LV','LT','BY','AF','IQ','JO','LB','SY','YE','IR','PS','BT','MM','KH','LA','MN','BN','MV','MU','SC','MG','MZ','AO','NA','BW','ZM','ZW','MW','SZ','LS','CM','CI','SN','GM','GN','SL','LR','BF','ML','NE','TD','CF','CG','CD','GA','GQ','ST','CV','DJ','ER','SO','SD','SS','LY','MR','BI','KM','RE','YT','MQ','GP','GF','AW','CW','SX','BM','KY','TC','VG','AI','MS','AG','KN','LC','VC','GD','HT','CU','GL','FO','GI','IM','JE','GG','AX','PF','NC','WF','CK','NU','TK','TV','NR','KI','TL','AQ','BV','HM','TF','GS','FK','PN','SH','PM','EH',
]

export const COUNTRY_OPTIONS = (() => {
  const display = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
  const rows = COUNTRY_CODES.map((code) => ({ code, label: display?.of(code) || code }))
  rows.sort((a, b) => {
    if (a.code === 'US') return -1
    if (b.code === 'US') return 1
    return a.label.localeCompare(b.label)
  })
  return rows
})()
