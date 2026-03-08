function ErrorPage({ statusCode }) {
  const code = statusCode || 500;
  const message = code === 404 ? "Page not found." : "Something went wrong.";

  return (
    <div style={{ padding: 40, fontFamily: "Arial" }}>
      <h1>Error {code}</h1>
      <p>{message}</p>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res?.statusCode || err?.statusCode || 500;
  return { statusCode };
};

export default ErrorPage;
