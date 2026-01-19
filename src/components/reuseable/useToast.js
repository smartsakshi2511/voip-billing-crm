import Swal from "sweetalert2";

// Toast instance
const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true,
  background: "linear-gradient(to bottom, #111827, #1f2937, #111827)", // 👈 gradient
  color: "#fff", // 👈 white text
  didOpen: (toast) => {
    toast.addEventListener("mouseenter", Swal.stopTimer);
    toast.addEventListener("mouseleave", Swal.resumeTimer);
  },
});


const useToast = () => {
  return {
    success: (message) =>
      Toast.fire({
        icon: "success",
        title: message || "Success!",
      }),
    error: (message) =>
      Toast.fire({
        icon: "error",
        title: message || "Something went wrong!",
      }),
    info: (message) =>
      Toast.fire({
        icon: "info",
        title: message || "Information",
      }),
    warning: (message) =>
      Toast.fire({
        icon: "warning",
        title: message || "Warning!",
      }),

    // ✅ Confirm toast at bottom (promise resolves true/false)
    confirmToast: (message = "Are you sure?") =>
      new Promise((resolve) => {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "warning",
          title: message,
          showConfirmButton: true,
          confirmButtonText: "Yes",
          showCancelButton: true,
          cancelButtonText: "Cancel",
          timer: 0, // infinite until user clicks
        }).then((result) => {
          resolve(result.isConfirmed);
        });
      }),
  };
};

export default useToast;
