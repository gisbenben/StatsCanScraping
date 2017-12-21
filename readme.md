## Introduction

Project `ArcticFoodWebScraping` was created to scrape data for the ongoing ArcticFood project.

Based on the output log file (`info.log`), the script ran from 10:09PM to 1:32AM on `gistest` server, taking ~3.5 hours.

### Viewing the sqlite database
  - either install 'DB Browser for SQLite' ( `\\gistest\www\ArcticFoodWebScraping\data.db` or [download it here](http://sqlitebrowser.org/)) to view it offline on your computer,
  - or view it online (sql query support): https://gistest.usask.ca/ArcticFoodWebScraping/viewer/?url=https://gistest.usask.ca/ArcticFoodWebScraping/data.db

## Summary
- Database name: `data.db` ([download it here](https://gistest.usask.ca/ArcticFoodWebScraping/data.db))
- Table name: `statcan_chapter3`
  - What does `chapter3` mean?
    - Stats Canada uses 'Harmonized System' chapters to categorize Canadian products
    - 'chapter 3' in 'Harmonized System' contains all fish products and that's what we are interested in the ArcticFood project
- Total records: 55,641
- Number of years: 1988-2017 (30 years)
- Number of countries:
  - There are 270 countries included in StatCan's database,
  - but only 268 contains valid data from 1988-2017 (may not necessarily have data for all the 30 years
      - times of scanning: 270 * 30 = 8100
      - theoretical data records: 268 * 30 = 8040
      - actual records: 4464 (due to empty records for certain country and year combinations)
      ```sql
      -- countries having data: 268
      select count(0)
      	from (
      	select distinct country
      		from statcan_chapter3
      		order by country
      	)

      -- unique (country, year) combinations: 4464
      select count(0)
      	from (
      	select distinct country, year
      		from statcan_chapter3
      		order by country, year
      	)
      ```

- Types of commodity: 258
```sql
-- unique commodity types: 258
select count(0)
	from (
	select distinct commodity
		from statcan_chapter3
		order by commodity
	)
```
