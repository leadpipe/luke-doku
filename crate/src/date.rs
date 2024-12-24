use std::fmt::{Debug, Display};

use chrono::{Datelike, NaiveDate};
use js_sys::Date;
use wasm_bindgen::prelude::*;

/// A naive date, ie one that consists of Gregorian year, month, and day as if
/// that calendar had existed for all time.  Unlike the chrono NaiveDate struct,
/// this is one that works in JavaScript land.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[wasm_bindgen]
pub struct LogicalDate(i32);

#[wasm_bindgen]
impl LogicalDate {
  #[wasm_bindgen(constructor)]
  pub fn new(year: i32, month: u32, day: u32) -> Self {
    Self::from_ymd(year, month, day)
  }

  #[wasm_bindgen(js_name = "fromString")]
  pub fn new_from_string(s: &str) -> Self {
    Self::from(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap())
  }

  #[wasm_bindgen(js_name = "fromDate")]
  pub fn new_from_date(d: &Date) -> Self {
    Self::new(d.get_full_year() as _, d.get_month() + 1, d.get_date())
  }

  pub fn year(&self) -> i32 {
    self.const_year()
  }

  pub fn month(&self) -> u32 {
    self.const_month()
  }

  pub fn day(&self) -> u32 {
    self.const_day()
  }

  /// Returns this date's weekday, with 0 being Monday and 6 being Sunday.
  pub fn weekday(&self) -> u32 {
    let date: NaiveDate = (*self).into();
    date.weekday() as _
  }

  #[wasm_bindgen(js_name = "toString")]
  pub fn to_iso_string(&self) -> String {
    self.to_string()
  }

  #[wasm_bindgen(js_name = "toDateAtMidnight")]
  pub fn to_date(&self) -> Date {
    Date::new_with_year_month_day(self.year() as u32, self.month() as i32 - 1, self.day() as i32)
  }

  #[wasm_bindgen(js_name = "daysSince")]
  pub fn days_since(&self, other: &LogicalDate) -> i32 {
    let date: NaiveDate = (*self).into();
    date.signed_duration_since((*other).into()).num_days() as _
  }
}

impl LogicalDate {
  pub fn from_ymd(year: i32, month: u32, day: u32) -> Self {
    Self::from(NaiveDate::from_ymd_opt(year, month, day).expect("invalid date"))
  }

  pub const fn const_year(self) -> i32 {
    self.0 / 100_00
  }

  pub const fn const_month(self) -> u32 {
    self.0.abs().rem_euclid(100_00) as u32 / 100
  }

  pub const fn const_day(self) -> u32 {
    self.0.abs().rem_euclid(100) as u32
  }
}

impl Display for LogicalDate {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let date: NaiveDate = (*self).into();
    Display::fmt(&date, f)
  }
}

impl From<NaiveDate> for LogicalDate {
  fn from(date: NaiveDate) -> Self {
    let year = date.year();
    let sign = if year < 0 { -1 } else { 1 };
    Self(sign * (year.abs() * 100_00 + date.month() as i32 * 100 + date.day() as i32))
  }
}
impl Into<NaiveDate> for LogicalDate {
  fn into(self) -> NaiveDate {
    NaiveDate::from_ymd_opt(self.const_year(), self.const_month(), self.const_day()).unwrap()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_basics() {
    let date = LogicalDate::from_ymd(1492, 10, 11);
    assert_eq!(1492, date.year());
    assert_eq!(10, date.month());
    assert_eq!(11, date.day());
    assert_eq!(1492_10_11, date.0);
    assert_eq!("1492-10-11", date.to_string());
  }

  #[test]
  fn test_extremes() {
    let date = LogicalDate::from_ymd(0, 1, 31);
    assert_eq!(0, date.year());
    assert_eq!(1, date.month());
    assert_eq!(31, date.day());
    assert_eq!(1_31, date.0);
    assert_eq!("0000-01-31", date.to_string());

    let date = LogicalDate::from_ymd(-1, 2, 28);
    assert_eq!(-1, date.year());
    assert_eq!(2, date.month());
    assert_eq!(28, date.day());
    assert_eq!(-1_02_28, date.0);
    assert_eq!("-0001-02-28", date.to_string());

    let date = LogicalDate::from_ymd(10001, 12, 31);
    assert_eq!(10001, date.year());
    assert_eq!(12, date.month());
    assert_eq!(31, date.day());
    assert_eq!(10001_12_31, date.0);
    assert_eq!("+10001-12-31", date.to_string());
  }

  #[test]
  #[should_panic(expected = "invalid")]
  fn test_day_0() {
    LogicalDate::from_ymd(1234, 12, 0);
  }

  #[test]
  #[should_panic(expected = "invalid")]
  fn test_month_0() {
    LogicalDate::from_ymd(1234, 0, 5);
  }
}
