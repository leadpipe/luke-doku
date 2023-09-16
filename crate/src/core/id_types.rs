//! The `define_id_types` macro.

/// Defines types that consist of a single integer-valued ID.
///
/// You specify for each such type its name, the int type for the contained ID,
/// and the number of distinct values of the type.
///
/// We use these types for many different aspects of Sudoku.
#[macro_export]
macro_rules! define_id_types {
    (
        $(
            $(#[$outer:meta])*
            $type_name:ident : $int_type:ty[$count:expr];
        )*
    ) => {
        $(
            define_id_types!(
                @nested $(#[$outer])* $type_name, $int_type, $count,
                concat!("The number of distinct values a `",
                    stringify!($type_name), "` may take on."),
                concat!(
                    "Makes a new `", stringify!($type_name),
                    "` given its ID, which the caller must ensure is in the range 0..",
                    stringify!($count), ".\n\n# Safety\n\nCallers must ensure the argument is in range."),
                concat!(
                    "Makes a new `", stringify!($type_name),
                    "` given its ID, if it's in the range 0..",
                    stringify!($count), "."),
                concat!("Returns this `", stringify!($type_name), "`'s ID."),
                concat!("Returns this `", stringify!($type_name), "`'s ordinal number, which starts at 1."),
                concat!("Returns this `", stringify!($type_name),
                    "`'s ID in a form suitable for use as an array index."),
                concat!("Iterates all distinct `", stringify!($type_name), "` values.")
            );
        )*
    };
    (
        @nested
        $(#[$outer:meta])*
        $type_name:ident, $int_type:ty, $count:expr,
        $count_doc:expr,
        $new_unchecked_doc:expr,
        $new_doc:expr,
        $get_doc:expr,
        $ordinal_doc:expr,
        $index_doc:expr,
        $all_doc:expr
    ) => {
        #[derive(Clone, Copy, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
        $(#[$outer])*
        pub struct $type_name($int_type);

        impl $type_name {
            #[doc = $count_doc]
            pub const COUNT: usize = $count;

            #[doc = $new_unchecked_doc]
            pub const unsafe fn new_unchecked(id: $int_type) -> Self {
                $type_name(id)
            }

            #[doc = $new_doc]
            pub const fn new(id: $int_type) -> Option<Self> {
                if id >= 0 && id < $count {
                    Some($type_name(id))
                } else {
                    None
                }
            }

            #[doc = $new_unchecked_doc]
            pub const unsafe fn from_index_unchecked(i: usize) -> Self {
                $type_name(i as $int_type)
            }

            #[doc = $new_doc]
            pub const fn from_index(i: usize) -> Option<Self> {
                if i < $count {
                    Some($type_name(i as $int_type))
                } else {
                    None
                }
            }

            #[doc = $get_doc]
            pub const fn get(self) -> $int_type {
                self.0
            }

            #[doc = $ordinal_doc]
            pub const fn ordinal(self) -> $int_type {
                self.0 + 1
            }

            #[doc = $index_doc]
            pub const fn index(self) -> usize {
                self.0 as usize
            }

            #[doc = $all_doc]
            pub fn all() -> impl Iterator<Item = Self> {
                (0..$count).map(|i| unsafe {Self::new_unchecked(i)})
            }
        }

        impl TryFrom<$int_type> for $type_name {
            type Error = &'static str;
            #[doc = $new_doc]
            fn try_from(value: $int_type) -> Result<Self, Self::Error> {
                $type_name::new(value).ok_or("Out of bounds")
            }
        }

        impl TryFrom<usize> for $type_name {
            type Error = &'static str;
            #[doc = $new_doc]
            fn try_from(value: usize) -> Result<Self, Self::Error> {
                $type_name::from_index(value).ok_or("Out of bounds")
            }
        }

        impl From<$type_name> for $int_type {
            #[doc = $get_doc]
            fn from(n: $type_name) -> Self {
                n.get()
            }
        }

        impl From<$type_name> for usize {
            #[doc = $index_doc]
            fn from(n: $type_name) -> Self {
                n.index()
            }
        }
    };
}
