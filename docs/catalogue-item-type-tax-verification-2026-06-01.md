# Catalogue Item Type And Tax Verification

Batch 4 checked `goodsservices.item_type` and `goodsservices.tax`.

No data conversion was needed:

- `goodsservices.item_type` already points to `item_type.id`.
- `goodsservices.tax` already points to `tax.id`.
- All populated values are numeric and have matching lookup rows.

Verification result:

| Field | Populated rows | Missing lookup references | Non-numeric values |
| --- | ---: | ---: | ---: |
| `goodsservices.item_type -> item_type.id` | 972 | 0 | 0 |
| `goodsservices.tax -> tax.id` | 966 | 0 | 0 |

Current item types:

| ID | Name | Used rows |
| ---: | --- | ---: |
| 1 | Main | 413 |
| 2 | Accessory | 265 |
| 3 | Spares | 235 |
| 4 | Software | 32 |
| 5 | Not Applicable | 27 |

Current taxes:

| ID | Name | Rate | Used rows |
| ---: | --- | ---: | ---: |
| 1 | NR | 0 | 942 |
| 3 | GST | 0 | 24 |

`tax.id = 2` (`SST`, 8%) exists in the lookup table but is not currently assigned to any catalogue item.
