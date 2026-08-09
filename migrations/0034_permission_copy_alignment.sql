UPDATE permission_catalog
SET label = 'Manage team & vendors',
    description = 'Open Team & Vendors, review workload and performance, approve pending providers, and maintain operational profile details. Role assignments, capability grants, and Owner authority remain Owner-only.'
WHERE permission_key = 'manage_team';
