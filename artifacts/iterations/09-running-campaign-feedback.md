# Cycle 9: running-campaign-feedback

Review: Post-investment review found an activecampaign card still subtracting its paidcost from currentcash a second time in a preview label.

Design: Keep first-action feedback truthful after a campaign has already been paid for.

Contract: ECON@3. Task: T020.

Verification: Type/lint/format/build and built real active-campaign save-fact/settlement regression; included in163unit/5contract projectgate; spec lint.

Outcome: Active marketing cards show their actual paid cost, currentcash and remainingrounds, with new-campaign hypothetical budgets kept separate.
